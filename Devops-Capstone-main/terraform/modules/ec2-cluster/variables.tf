variable "project_name"                  { type = string }
variable "vpc_id"                        { type = string }
variable "private_subnet_ids"            { type = list(string) }
variable "k3s_sg_id"                     { type = string }
variable "ec2_ami"                       { type = string }
variable "control_plane_instance_type"   { type = string }
variable "worker_instance_type"          { type = string }
variable "worker_min_size"               { type = number }
variable "worker_max_size"               { type = number }
variable "worker_desired_size"           { type = number }
variable "k3s_token" {
  type      = string
  sensitive = true
}
variable "alb_target_group_arn"          { type = string }
