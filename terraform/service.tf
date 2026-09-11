# The frontend as a Fargate service: task definition, ECS service, autoscaling
# and the catch-all load balancer rule.
#
# Same shape as the Go services deliberately, so anyone who has read one of
# those modules has read this one. The differences are all in what the
# container is: Node rather than Go, one port rather than two, no gRPC and no
# service discovery — nothing calls the frontend, it calls out.

resource "aws_cloudwatch_log_group" "service" {
  name              = "/ecs/${local.name}"
  retention_in_days = 7
  tags              = { Name = local.name }
}

resource "aws_ecs_task_definition" "main" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory

  execution_role_arn = aws_iam_role.task_execution.arn
  task_role_arn      = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = var.service_name
      image     = "${local.platform.ecr_repository_urls[var.service_name]}:bootstrap"
      essential = true

      portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]

      environment = concat(
        [
          { name = "NODE_ENV", value = "production" },
          { name = "PORT", value = tostring(var.container_port) },
          { name = "HOST", value = "0.0.0.0" },

          # adapter-node needs to know its public origin to validate form
          # submissions; behind a load balancer it cannot infer it from the
          # request. Without this every POST from the login form is refused
          # as cross-site.
          { name = "ORIGIN", value = "https://${var.public_hostname}" },

          # PUBLIC_API_URL is deliberately NOT set. The API services share
          # this load balancer, so the relative /api/v1 the code defaults to
          # is correct — and one fewer hostname to get wrong.

          { name = "PUBLIC_MAPID_BASEMAP_KEY", value = var.public_mapid_basemap_key },
          { name = "COMMS_SERVICE_URL", value = var.comms_service_url },
        ],
        var.extra_environment,
      )

      # The one value that must not reach a task definition in plain text.
      secrets = var.comms_api_key_secret_arn != "" ? [
        { name = "COMMS_API_KEY", valueFrom = var.comms_api_key_secret_arn }
      ] : []

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.service.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        # node:alpine ships wget. The auth page is the lightest route that
        # exercises the SvelteKit server end to end.
        command     = ["CMD-SHELL", "wget -qO- http://localhost:${var.container_port}${var.health_check_path} > /dev/null || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])

  # The image tag is set by CodePipeline on every deploy, so Terraform must not
  # fight it.
  lifecycle {
    ignore_changes = [container_definitions]
  }

  tags = { Name = local.name }
}

resource "aws_ecs_service" "main" {
  name            = var.service_name
  cluster         = local.platform.ecs_cluster_arn
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.tasks_in_public_subnets ? local.platform.public_subnet_ids : local.platform.private_subnet_ids
    security_groups  = [local.platform.tasks_security_group_id]
    assign_public_ip = var.tasks_in_public_subnets
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = var.service_name
    container_port   = var.container_port
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener_rule.main]

  tags = { Name = local.name }
}

# --- Load balancer routing --------------------------------------------------

resource "aws_lb_target_group" "main" {
  name        = local.name
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = local.platform.vpc_id
  target_type = "ip"

  health_check {
    path                = var.health_check_path
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = { Name = local.name }
}

# The catch-all. Priority is the HIGHEST number of any rule on the listener,
# so every API rule is evaluated first and this one only sees what none of
# them claimed. See variables.tf on listener_priority for why that matters.
resource "aws_lb_listener_rule" "main" {
  listener_arn = local.platform.alb_https_listener_arn
  priority     = var.listener_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }

  condition {
    path_pattern {
      values = var.path_patterns
    }
  }

  tags = { Name = local.name }
}

# --- Autoscaling ------------------------------------------------------------

resource "aws_appautoscaling_target" "main" {
  service_namespace  = "ecs"
  resource_id        = "service/${local.platform.ecs_cluster_name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.min_capacity
  max_capacity       = var.max_capacity
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.main.service_namespace
  resource_id        = aws_appautoscaling_target.main.resource_id
  scalable_dimension = aws_appautoscaling_target.main.scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 65
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
