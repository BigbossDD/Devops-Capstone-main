# Subnet group spans both private subnets (required for RDS, even single-AZ)
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${var.project_name}-db-subnet-group" }
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${var.project_name}-postgres16"
  family = "postgres16"

  tags = { Name = "${var.project_name}-postgres16" }
}

resource "aws_db_instance" "main" {
  identifier        = "${var.project_name}-postgres"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"   # free-tier eligible
  allocated_storage = 20              # free-tier max
  storage_type      = "gp2"

  db_name  = "marketly"
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.rds_sg_id]
  parameter_group_name   = aws_db_parameter_group.postgres.name

  # Free-tier: single-AZ, no standby
  multi_az            = false
  publicly_accessible = false

  # Backups: 7-day window — costs a few cents but worth it
  backup_retention_period = 1
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  # Prevent accidental deletion during terraform destroy
  deletion_protection = false   # set to true in production
  skip_final_snapshot = true    # set to false in production

  tags = { Name = "${var.project_name}-postgres" }
}
