# IAM role so SSM Session Manager works (no SSH key needed)
resource "aws_iam_role" "nat" {
  name = "${var.project_name}-nat-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "nat_ssm" {
  role       = aws_iam_role.nat.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nat" {
  name = "${var.project_name}-nat-profile"
  role = aws_iam_role.nat.name
}

# NAT instance — t3.micro sits in the public subnet.
# source_dest_check = false is mandatory: without it AWS drops forwarded packets
# because the destination IP doesn't match the instance's own IP.
resource "aws_instance" "nat" {
  ami                         = var.ec2_ami
  instance_type               = "t3.micro"
  subnet_id                   = var.public_subnet_id
  vpc_security_group_ids      = [var.nat_sg_id]
  source_dest_check           = false   # REQUIRED for NAT
  iam_instance_profile        = aws_iam_instance_profile.nat.name
  associate_public_ip_address = true

  # Enable IP forwarding and set up iptables masquerade rule on boot.
  # This is what actually makes it a NAT — turns EC2 into a router.
  user_data = <<-USERDATA
    #!/bin/bash
    set -euo pipefail

    # Start SSM agent first so this instance is always reachable for debugging
    systemctl enable --now amazon-ssm-agent || true

    # Install iptables AND the legacy iptables binary itself — Amazon Linux 2023
    # does not ship the iptables command by default, only iptables-services
    # (the persistence/systemd wrapper) does NOT include the binary either.
    dnf install -y iptables iptables-services

    # Enable kernel IP forwarding
    echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf
    sysctl -p

    # Masquerade outbound traffic (SNAT) so return packets know where to go.
    # Use the primary interface dynamically instead of hardcoding eth0 —
    # Amazon Linux 2023 ENA interfaces are typically named ens5, not eth0.
    PRIMARY_IFACE=$(ip -o -4 route show to default | awk '{print $5}')
    iptables -t nat -A POSTROUTING -o "$PRIMARY_IFACE" -j MASQUERADE

    # Persist iptables rules across reboots
    service iptables save
    systemctl enable iptables
  USERDATA

  tags = { Name = "${var.project_name}-nat-instance" }
}

# Add the default route in the private route table pointing at this NAT instance.
# This is what makes private subnets "see" the internet through the NAT.
resource "aws_route" "private_to_nat" {
  route_table_id         = var.private_route_table_id
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_instance.nat.primary_network_interface_id
}
