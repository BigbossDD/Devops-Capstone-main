output "github_actions_role_arn" {
  description = "ARN of the IAM role GitHub Actions assumes"
  value       = aws_iam_role.github_actions.arn
}
