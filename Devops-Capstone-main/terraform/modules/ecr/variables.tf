variable "project_name" { type = string }
variable "services" {
  description = "List of service names — one ECR repo per service"
  type        = list(string)
  default     = ["auth-service", "catalog-service", "orders-service", "frontend"]
}
