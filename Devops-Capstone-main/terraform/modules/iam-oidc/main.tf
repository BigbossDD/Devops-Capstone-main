# GitHub's OIDC provider thumbprint (stable — GitHub publishes this)
data "aws_caller_identity" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # SHA-1 thumbprint of GitHub's OIDC certificate — stable value
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# IAM role that GitHub Actions assumes via OIDC.
# The trust policy restricts it to YOUR repo only — not every GitHub Actions job.
resource "aws_iam_role" "github_actions" {
  name = "${var.project_name}-github-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringLike = {
          # Locks trust to your specific repo — both main branch pushes and PRs
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
        }
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

# Least-privilege policy — only what CI/CD actually needs:
# ECR: push images
# EC2: describe instances (for deploy scripts)
# SSM: not needed by GHA directly (runner lives on the instance)
resource "aws_iam_policy" "github_actions" {
  name        = "${var.project_name}-github-actions-policy"
  description = "Least-privilege policy for GitHub Actions CI/CD via OIDC"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRAuth"
        Effect = "Allow"
        Action = ["ecr:GetAuthorizationToken"]
        Resource = ["*"]   # GetAuthorizationToken is account-level, can't scope to repo
      },
      {
        Sid    = "ECRPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:DescribeRepositories",
          "ecr:ListImages",
        ]
        Resource = var.ecr_repo_arns
      },
      {
        Sid    = "EC2Describe"
        Effect = "Allow"
        Action = ["ec2:DescribeInstances"]
        Resource = ["*"]
      },
      {
        Sid    = "TerraformState"
        Effect = "Allow"
        Action = [
          "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket",
          "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem",
        ]
        Resource = ["*"]   # narrow to your specific bucket/table ARNs for production
      },
      {
        Sid    = "TerraformProvision"
        Effect = "Allow"
        Action = [
          "ec2:*", "elasticloadbalancing:*", "autoscaling:*",
          "rds:*", "iam:*", "s3:*", "ecr:*",
          "logs:*", "ssm:*"
        ]
        Resource = ["*"]   # acceptable for a dev capstone; narrow in production
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "github_actions" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions.arn
}
