// Packer template for the munadi VO-ready macOS Sequoia (15) image.
// Mirrors sonoma.pkr.hcl; see that file for full comments.

packer {
  required_plugins {
    tart = {
      source  = "github.com/cirruslabs/tart"
      version = "~> 1.14"
    }
    ansible = {
      source  = "github.com/hashicorp/ansible"
      version = "~> 1.1"
    }
  }
}

variable "macos_version" {
  type    = string
  default = "sequoia"
}

variable "base_image" {
  type        = string
  default     = "ghcr.io/cirruslabs/macos-sequoia-xcode:latest"
  description = "Base image from cirruslabs."
}

variable "output_name" {
  type    = string
  default = "munadi-vo-ready-sequoia"
}

variable "disk_size_gb" {
  type    = number
  default = 60
}

variable "cpu_count" {
  type    = number
  default = 4
}

variable "memory_gb" {
  type    = number
  default = 8
}

variable "full_image" {
  type    = bool
  default = false
}

source "tart-cli" "sequoia" {
  vm_base_name      = var.base_image
  vm_name           = var.output_name
  cpu_count         = var.cpu_count
  memory_gb         = var.memory_gb
  disk_size_gb      = var.disk_size_gb
  ssh_username      = "admin"
  ssh_password      = "admin"
  ssh_timeout       = "120s"
  headless          = true
  create_grace_time = "30s"
}

build {
  name    = "munadi-macos-sequoia"
  sources = ["source.tart-cli.sequoia"]

  provisioner "shell" {
    inline = [
      "until dscl . -read /Users/admin >/dev/null 2>&1; do sleep 2; done",
      "sw_vers",
    ]
  }

  provisioner "ansible" {
    playbook_file = "${path.root}/../ansible/playbook.yml"
    user          = "admin"
    extra_arguments = [
      "--extra-vars", "macos_version=${var.macos_version}",
      "--extra-vars", "full_image=${var.full_image}",
      "--scp-extra-args", "'-O'",
    ]
    ansible_env_vars = [
      "ANSIBLE_HOST_KEY_CHECKING=False",
      "ANSIBLE_STDOUT_CALLBACK=yaml",
    ]
  }

  provisioner "shell" {
    inline = [
      "if [ '${var.full_image}' = 'false' ]; then",
      "  sudo rm -rf /Applications/Xcode*.app || true",
      "  sudo rm -rf ~/Library/Developer/CoreSimulator || true",
      "  sudo rm -rf /Library/Developer/CoreSimulator || true",
      "  sudo rm -rf ~/Library/Caches/* || true",
      "  sudo rm -rf /Library/Caches/* || true",
      "fi",
      "df -h /",
    ]
  }

  provisioner "shell" {
    inline = [
      "which node && node --version",
      "which pnpm && pnpm --version",
      "defaults read com.apple.VoiceOver4/default SCREnableAppleScript || true",
    ]
  }
}
