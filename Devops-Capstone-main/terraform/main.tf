# ─────────────────────────────────────────────────────────────────────────────
# Root main.tf — calls all 8 modules in dependency order,
# wiring each module's outputs into the next module's inputs.
# ─────────────────────────────────────────────────────────────────────────────

# 1. VPC — everything else lives inside it
module "vpc" {
  source       = "./modules/vpc"
  project_name = var.project_name
  vpc_cidr     = var.vpc_cidr
}

# 2. Security groups — need VPC ID + CIDR
module "security_groups" {
  source       = "./modules/security-groups"
  project_name = var.project_name
  vpc_id       = module.vpc.vpc_id
  vpc_cidr     = module.vpc.vpc_cidr
}

# 3. NAT instance — needs a public subnet + nat-sg + private route table
module "nat_instance" {
  source                  = "./modules/nat-instance"
  project_name            = var.project_name
  public_subnet_id        = module.vpc.public_subnet_ids[0]
  nat_sg_id               = module.security_groups.nat_sg_id
  private_route_table_id  = module.vpc.private_route_table_id
  ec2_ami                 = var.ec2_ami
}

# 4. ECR — no VPC dependency, can run in parallel with 3
module "ecr" {
  source       = "./modules/ecr"
  project_name = var.project_name
}

# 5a. ALB — needs public subnets + alb-sg (target group ARN fed to ec2-cluster)
module "alb" {
  source             = "./modules/alb"
  project_name       = var.project_name
  vpc_id             = module.vpc.vpc_id
  public_subnet_ids  = module.vpc.public_subnet_ids
  alb_sg_id          = module.security_groups.alb_sg_id
}

# 5b. EC2 cluster — needs private subnets + k3s-sg + ALB target group ARN
module "ec2_cluster" {
  source                       = "./modules/ec2-cluster"
  project_name                 = var.project_name
  vpc_id                       = module.vpc.vpc_id
  private_subnet_ids           = module.vpc.private_subnet_ids
  k3s_sg_id                    = module.security_groups.k3s_sg_id
  ec2_ami                      = var.ec2_ami
  control_plane_instance_type  = var.control_plane_instance_type
  worker_instance_type         = var.worker_instance_type
  worker_min_size              = var.worker_min_size
  worker_max_size              = var.worker_max_size
  worker_desired_size          = var.worker_desired_size
  k3s_token                    = var.k3s_token
  alb_target_group_arn         = module.alb.target_group_arn
}

# 6. RDS — needs private subnets + rds-sg
module "rds" {
  source             = "./modules/rds"
  project_name       = var.project_name
  private_subnet_ids = module.vpc.private_subnet_ids
  rds_sg_id          = module.security_groups.rds_sg_id
  db_username        = var.db_username
  db_password        = var.db_password
}

# 7. IAM OIDC — needs ECR repo ARNs
module "iam_oidc" {
  source        = "./modules/iam-oidc"
  project_name  = var.project_name
  github_repo   = var.github_repo
  ecr_repo_arns = values(module.ecr.repository_arns)
}
