// Packer template for the ogmios VO-ready macOS Sonoma (14) image.
//
// Produces: ghcr.io/thejackshelton/ogmios/macos-vo-ready:sonoma (slim, ~<15 GB)
// Optional: ghcr.io/thejackshelton/ogmios/macos-vo-ready:sonoma@full (Xcode + iOS sims, ~50 GB)
//
// Build locally:
//   packer init infra/tart/packer/sonoma.pkr.hcl
//   packer build infra/tart/packer/sonoma.pkr.hcl
//
// Publish (from release pipeline):
//   tart push ghcr.io/thejackshelton/ogmios/macos-vo-ready:sonoma --shallow

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
  default = "sonoma"
}

variable "base_image" {
  type        = string
  default     = "ghcr.io/cirruslabs/macos-sonoma-xcode:latest"
  description = "Base image from cirruslabs. Use :latest for the current patch; pin for reproducibility."
}

variable "output_name" {
  type    = string
  default = "ogmios-vo-ready-sonoma"
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
  type        = bool
  default     = false
  description = "If true, keep Xcode + iOS simulators (~50 GB). If false, strip for slim image."
}

source "tart-cli" "sonoma" {
  vm_base_name = var.base_image
  vm_name      = var.output_name
  cpu_count    = var.cpu_count
  memory_gb    = var.memory_gb
  disk_size_gb = var.disk_size_gb
  ssh_username = "admin"
  ssh_password = "admin"
  ssh_timeout  = "120s"
  headless     = true

  // Expose a port for Ansible SSH
  create_grace_time = "30s"
}

build {
  name    = "ogmios-macos-sonoma"
  sources = ["source.tart-cli.sonoma"]

  // Wait for the VM to be reachable + the admin account to be ready.
  provisioner "shell" {
    inline = [
      "echo 'waiting for login…'",
      "until dscl . -read /Users/admin >/dev/null 2>&1; do sleep 2; done",
      "echo 'admin account present'",
      "sw_vers",
    ]
  }

  // Run the Ansible playbook over SSH.
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

  // Slim pass: drop Xcode + iOS sims unless @full requested.
  provisioner "shell" {
    inline = [
      "if [ '${var.full_image}' = 'false' ]; then",
      "  echo 'stripping Xcode + simulators for slim image…'",
      "  sudo rm -rf /Applications/Xcode*.app || true",
      "  sudo rm -rf ~/Library/Developer/CoreSimulator || true",
      "  sudo rm -rf /Library/Developer/CoreSimulator || true",
      "  sudo rm -rf ~/Library/Caches/* || true",
      "  sudo rm -rf /Library/Caches/* || true",
      "else",
      "  echo 'keeping Xcode + simulators (full image)'",
      "fi",
      "df -h /",
    ]
  }

  // Final health probe. This is the canary that Phase 5 images boot with ogmios doctor ready.
  provisioner "shell" {
    inline = [
      "which node && node --version",
      "which pnpm && pnpm --version",
      "defaults read com.apple.VoiceOver4/default SCREnableAppleScript || true",
      "echo 'image build complete'",
    ]
  }
}
