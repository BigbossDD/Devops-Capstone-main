# Remote state — create the S3 bucket and DynamoDB table MANUALLY before
# running terraform init. See Phase 4 setup instructions.
#
# S3 bucket:      <your-project-name>-terraform-state
# DynamoDB table: <your-project-name>-terraform-locks  (partition key: LockID, type String)
terraform {
  backend "s3" {
    bucket         = "marketly-terraform-state"      # change to your bucket name
    key            = "capstone/terraform.tfstate"
    region         = "us-east-1"                  
    dynamodb_table = "marketly-terraform-locks"      # change to your table name
    encrypt        = true
  }
}
