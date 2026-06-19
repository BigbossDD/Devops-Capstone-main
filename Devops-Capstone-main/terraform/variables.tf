variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short name prefix for all resources (e.g. marketly)"
  type        = string
  default     = "marketly"
}

variable "environment" {
  description = "Environment label (dev / staging / prod)"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "github_repo" {
  description = "GitHub repo in owner/name format for OIDC trust (e.g. BigbossDD/Devops-Capstone)"
  type        = string
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "marketly"
  sensitive   = true
}

variable "db_password" {
  description = "RDS master password — set via TF_VAR_db_password env var, never hardcode"
  type        = string
  sensitive   = true
}

variable "k3s_token" {
  description = "Shared secret used by k3s workers to join the control-plane — set via TF_VAR_k3s_token"
  type        = string
  sensitive   = true
}

variable "ec2_ami" {
  description = "AMI ID for EC2 instances (Amazon Linux 2023 in us-east-1)"
  type        = string
  default     = "ami-0453ec754f44f9a4a"   # Amazon Linux 2023 us-east-1 — update per region
}

variable "control_plane_instance_type" {
  description = "Instance type for the k3s control-plane"
  type        = string
  default     = "t3.micro"
}

variable "worker_instance_type" {
  description = "Instance type for k3s worker nodes"
  type        = string
  default     = "t3.micro"
}

variable "worker_min_size" {
  description = "Minimum number of k3s worker nodes in the ASG"
  type        = number
  default     = 1
}

variable "worker_max_size" {
  description = "Maximum number of k3s worker nodes in the ASG"
  type        = number
  default     = 3
}

variable "worker_desired_size" {
  description = "Desired number of k3s worker nodes in the ASG"
  type        = number
  default     = 2
}
