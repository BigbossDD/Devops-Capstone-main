# ── ALB security group ────────────────────────────────────────────────────────
# Only resource allowed to receive traffic from the public internet.
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Allow HTTP from internet to ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-alb-sg" }
}

# ── k3s nodes security group ──────────────────────────────────────────────────
# Accepts NodePort traffic only from the ALB, and internal cluster traffic
# (pod-to-pod, control-plane↔worker communication) within the SG itself.
resource "aws_security_group" "k3s" {
  name        = "${var.project_name}-k3s-sg"
  description = "k3s control-plane and worker nodes"
  vpc_id      = var.vpc_id

  # NodePort range - ALB forwards here
  ingress {
    description     = "NodePort range from ALB"
    from_port       = 30000
    to_port         = 32767
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # k3s API server (control-plane only, but applied to whole SG for simplicity)
  ingress {
    description = "k3s API server within cluster"
    from_port   = 6443
    to_port     = 6443
    protocol    = "tcp"
    self        = true
  }

  # Flannel VXLAN (pod networking overlay)
  ingress {
    description = "Flannel VXLAN"
    from_port   = 8472
    to_port     = 8472
    protocol    = "udp"
    self        = true
  }

  # Kubelet metrics
  ingress {
    description = "Kubelet"
    from_port   = 10250
    to_port     = 10250
    protocol    = "tcp"
    self        = true
  }

  # SSM Session Manager works over HTTPS outbound - no inbound SSH needed
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-k3s-sg" }
}

# ── RDS security group ────────────────────────────────────────────────────────
# Postgres port accessible only from k3s nodes - never from internet.
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "RDS PostgreSQL - allow only from k3s nodes"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from k3s nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.k3s.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-rds-sg" }
}

# ── NAT instance security group ───────────────────────────────────────────────
# Accepts traffic only from within the VPC (private subnets routing through it).
resource "aws_security_group" "nat" {
  name        = "${var.project_name}-nat-sg"
  description = "NAT instance - allow forwarded traffic from VPC CIDR only"
  vpc_id      = var.vpc_id

  ingress {
    description = "All traffic from VPC CIDR"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "All outbound to internet"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-nat-sg" }
}
