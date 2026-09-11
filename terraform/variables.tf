variable "region" {
  type    = string
  default = "ap-southeast-3"
}

variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging or prod."
  }
}

variable "service_name" {
  description = "Matches the ECR repository the platform created: karlo/<service_name>."
  type        = string
  default     = "karlo-platform"
}

variable "github_repository" {
  description = "owner/name of the repository the pipeline builds from."
  type        = string
  default     = "Star-Karlo/Karlo-Platform"
}

variable "github_branch" {
  type    = string
  default = "main"
}

# Sizing. The frontend renders SvelteKit pages and serves a static bundle — the
# lightest task in the fleet. See docs/shared/COST.md.
variable "task_cpu" {
  type    = number
  default = 256
}

variable "task_memory" {
  type    = number
  default = 512
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "min_capacity" {
  type    = number
  default = 1
}

variable "max_capacity" {
  type    = number
  default = 4
}

variable "container_port" {
  description = "adapter-node's listen port, set through PORT in the image."
  type        = number
  default     = 3000
}

variable "listener_priority" {
  description = <<-EOT
    ALB rule priority. The API services claim /api/v1/* at 100-400; the
    frontend claims everything else and must therefore evaluate LAST, which
    on an ALB means the highest number. If this were lower than an API rule
    the frontend would swallow API calls and answer them with its 404 page.
  EOT
  type        = number
  default     = 900
}

variable "path_patterns" {
  description = "The catch-all. Every path no API service claimed is a page."
  type        = list(string)
  default     = ["/*"]
}

variable "health_check_path" {
  type    = string
  default = "/auth"
}

# Configuration the page needs at RUNTIME, all public by nature — the browser
# receives every one of these. Nothing secret belongs here.
variable "public_mapid_basemap_key" {
  description = "MAPID basemap key. Public: the browser fetches tiles with it. Restrict it to your domain in MAPID's console."
  type        = string
}

variable "comms_service_url" {
  description = "Where the SvelteKit server proxies Customer Help calls. Empty disables the feature."
  type        = string
  default     = ""
}

# The one secret. Held server-side by the SvelteKit proxy route and never sent
# to a browser; injected from Secrets Manager, not an environment variable.
variable "comms_api_key_secret_arn" {
  description = "Secrets Manager ARN holding COMMS_API_KEY. Empty disables Customer Help."
  type        = string
  default     = ""
}

variable "extra_environment" {
  type    = list(object({ name = string, value = string }))
  default = []
}

variable "public_hostname" {
  description = "The hostname users type, e.g. tms.karlo.id. adapter-node validates form origins against it."
  type        = string
}

variable "tasks_in_public_subnets" {
  description = "Must match the platform's setting."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  type    = number
  default = 7
}
