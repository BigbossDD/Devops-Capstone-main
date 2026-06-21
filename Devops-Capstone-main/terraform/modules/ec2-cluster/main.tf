# ── IAM role for all k3s nodes (SSM + ECR pull) ──────────────────────────────
resource "aws_iam_role" "k3s_node" {
  name = "${var.project_name}-k3s-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.k3s_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr_readonly" {
  role       = aws_iam_role.k3s_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_instance_profile" "k3s_node" {
  name = "${var.project_name}-k3s-node-profile"
  role = aws_iam_role.k3s_node.name
}

# ── Control-plane EC2 ─────────────────────────────────────────────────────────
resource "aws_instance" "control_plane" {
  ami                    = var.ec2_ami
  instance_type          = var.control_plane_instance_type
  subnet_id              = var.private_subnet_ids[0]
  vpc_security_group_ids = [var.k3s_sg_id]
  iam_instance_profile   = aws_iam_instance_profile.k3s_node.name

  user_data = templatefile("${path.module}/templates/control-plane-user-data.sh.tpl", {
    k3s_token = var.k3s_token
  })

  # Increase root volume — k3s + container images need more than the default 8GB
  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  tags = { Name = "${var.project_name}-k3s-control-plane" }
}

# ── Launch Template for worker nodes ─────────────────────────────────────────
resource "aws_launch_template" "worker" {
  name_prefix   = "${var.project_name}-k3s-worker-"
  image_id      = var.ec2_ami
  instance_type = var.worker_instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.k3s_node.name
  }

  vpc_security_group_ids = [var.k3s_sg_id]

  user_data = base64encode(templatefile("${path.module}/templates/worker-user-data.sh.tpl", {
    k3s_token                = var.k3s_token
    control_plane_private_ip = aws_instance.control_plane.private_ip
  }))

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 20
      volume_type = "gp3"
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.project_name}-k3s-worker" }
  }
}

# ── Auto Scaling Group for workers ───────────────────────────────────────────
resource "aws_autoscaling_group" "workers" {
  name                = "${var.project_name}-k3s-workers"
  min_size            = var.worker_min_size
  max_size            = var.worker_max_size
  desired_capacity    = var.worker_desired_size
  vpc_zone_identifier = var.private_subnet_ids

  # Attach to ALB target group so new workers register automatically
  target_group_arns = [var.alb_target_group_arn]

  launch_template {
    id      = aws_launch_template.worker.id
    version = "$Latest"
  }

  health_check_type         = "ELB"
  health_check_grace_period = 120

  tag {
    key                 = "Name"
    value               = "${var.project_name}-k3s-worker"
    propagate_at_launch = true
  }

  # Wait for at least 1 instance to pass health checks before Terraform proceeds
  wait_for_capacity_timeout = "10m"

  depends_on = [aws_instance.control_plane]
}
