output "alb_dns_name" {
  description = "Paste this into your browser to reach the app"
  value       = module.alb.alb_dns_name
}

output "ecr_repository_urls" {
  description = "ECR URLs to push Docker images to"
  value       = module.ecr.repository_urls
}

output "rds_endpoint" {
  description = "RDS hostname — use in DATABASE_URL env var"
  value       = module.rds.db_endpoint
}

output "control_plane_instance_id" {
  description = "Instance ID for SSM Session Manager access"
  value       = module.ec2_cluster.control_plane_instance_id
}

output "github_actions_role_arn" {
  description = "Paste this into GitHub Actions workflow as the role-to-assume"
  value       = module.iam_oidc.github_actions_role_arn
}
