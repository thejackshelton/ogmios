#!/usr/bin/env bash
# kill-background-apps.sh
#
# Quit any macOS app whose announcements might leak into shoki VO captures.
# Runs as both pre-job and post-job hook in every shoki CI workflow (CI-05).
#
# Design:
#   - `osascript … quit` is the polite path (apps get to clean up state).
#   - `pkill -f` is the fallback for apps that ignore quit.
#   - launchctl unload of notificationcenterui silences banner announcements.
#   - All failures are swallowed (`|| true`) — this is best-effort, not a gate.
#
# Exit status: always 0. We never want this script to fail the job.
set +e

APPS=(
  "Slack"
  "Discord"
  "Teams"
  "Microsoft Teams"
  "Mail"
  "Calendar"
  "Reminders"
  "Notes"
  "Messages"
  "Spotify"
  "Music"
  "FaceTime"
)

echo "shoki: quitting background announcement emitters"
for app in "${APPS[@]}"; do
  osascript -e "tell application \"$app\" to quit" 2>/dev/null || true
  pkill -f "$app" 2>/dev/null || true
done

# Notification Center UI — its "banner appeared" announcements are the
# single biggest source of capture contamination on GH-hosted runners.
launchctl unload -w /System/Library/LaunchAgents/com.apple.notificationcenterui.plist 2>/dev/null || true

# Do not disable do-not-disturb here — we want DND on if it was on.
# Instead, enable it defensively if we can detect stock default.
defaults write com.apple.ncprefs dnd_prefs -data 62706c697374303000 2>/dev/null || true

echo "shoki: background app quiesce complete"
exit 0
