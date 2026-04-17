// Packer template for the shoki VO-ready macOS Tahoe (26) image.
// Mirrors sonoma.pkr.hcl; see that file for full comments.
//
// NOTE: The cirruslabs macos-tahoe-xcode base may not be published yet when
// this file is first checked in. If tart-push errors with "image not found",
// temporarily set base_image to a staging tag like `:26.0-beta` or skip tahoe
// from the publish matrix until the base ships. The shoki CI story does not
// require tahoe at phase-5 release; sonoma + sequoia satisfy CI-01 through CI-06.

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
  default = "tahoe"
}

variable "base_image" {
  type        = string
  default     = "ghcr.io/cirruslabs/macos-tahoe-xcode:latest"
  description = "Base image from cirruslabs. May not be published yet — see file header."
}

variable "output_name" {
  type    = string
  default = "shoki-vo-ready-tahoe"
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

source "tart-cli" "tahoe" {
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
  name    = "shoki-macos-tahoe"
  sources = ["source.tart-cli.tahoe"]

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
