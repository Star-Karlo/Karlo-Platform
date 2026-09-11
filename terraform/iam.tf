# IAM.
#
# Four roles, each scoped to what it actually needs. The split that matters most
# is task_execution versus task: the first is used by the ECS agent to pull the
# image and read secrets at start, the second is what the running application
# can do. Merging them would give the application the ability to read every
# secret the agent can.

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# --- Task execution role ----------------------------------------------------

resource "aws_iam_role" "task_execution" {
  name               = "${local.name}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Secret access is enumerated, not wildcarded. A service reads the secrets it
# needs and no others, so a compromised task definition cannot widen its own
# reach.
data "aws_iam_policy_document" "task_execution_secrets" {
  count = var.comms_api_key_secret_arn != "" ? 1 : 0

  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.comms_api_key_secret_arn]
  }
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  count = var.comms_api_key_secret_arn != "" ? 1 : 0

  name   = "${local.name}-secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_secrets[0].json
}

# --- Task role --------------------------------------------------------------

resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# The application's own permissions. Deliberately minimal: these services talk
# to their database, to each other over gRPC, and to Fluentd. None of that needs
# an AWS API call, so the only grant is the one ECS Exec needs for a shell into
# a running task, and only outside production.
data "aws_iam_policy_document" "task" {
  count = var.environment == "prod" ? 0 : 1

  statement {
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

# No inline policy in production. An empty Statement array is not a valid
# IAM document; a role with no policies attached IS the no-permissions state.

resource "aws_iam_role_policy" "task_exec_access" {
  count = var.environment == "prod" ? 0 : 1

  name   = "${local.name}-exec"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task[0].json
}
