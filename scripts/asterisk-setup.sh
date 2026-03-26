#!/bin/bash
# ============================================================
# CyberX AutoDialer — Asterisk Setup Script
# Tested on: Ubuntu 22.04 LTS / Debian 12
# Run as root: sudo bash scripts/asterisk-setup.sh
# ============================================================

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

[ "$(id -u)" != "0" ] && error "Run as root: sudo bash $0"

# ── Collect config ────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  CyberX AutoDialer — Asterisk Setup"
echo "============================================"
echo ""

read -rp "SIP trunk hostname (e.g. sip.cyberxcalls.com): " SIP_HOST
read -rp "SIP trunk username: " SIP_USER
read -rsp "SIP trunk password: " SIP_PASS; echo ""
read -rp "Your server public IP (leave blank to auto-detect): " PUBLIC_IP
read -rp "AMI secret for autodialer [default: changeme123]: " AMI_SECRET
AMI_SECRET="${AMI_SECRET:-changeme123}"

if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP=$(curl -s https://api.ipify.org || curl -s https://ifconfig.me)
  info "Detected public IP: $PUBLIC_IP"
fi

# ── Install Docker ────────────────────────────────────────────────────────────
info "Installing Docker..."
if ! command -v docker &>/dev/null; then
  apt-get update -qq
  apt-get install -y ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io
  systemctl enable --now docker
  info "Docker installed."
else
  info "Docker already installed."
fi

# ── Install ffmpeg ────────────────────────────────────────────────────────────
info "Installing ffmpeg..."
apt-get install -y ffmpeg &>/dev/null
info "ffmpeg ready."

# ── Pull / start Asterisk container ──────────────────────────────────────────
CONTAINER="local-asterisk"
AST_DIR="/etc/asterisk-docker"
mkdir -p "$AST_DIR/conf" "$AST_DIR/sounds/custom"

# Stop existing container if any
docker stop "$CONTAINER" 2>/dev/null || true
docker rm   "$CONTAINER" 2>/dev/null || true

info "Pulling Asterisk 20 image..."
docker pull andrius/asterisk:20 || docker pull asterisk:20 || {
  warn "Pulling mlan/asterisk as fallback..."
  docker pull mlan/asterisk:latest
  ASTERISK_IMAGE="mlan/asterisk:latest"
}
ASTERISK_IMAGE="${ASTERISK_IMAGE:-andrius/asterisk:20}"

# ── Write sip.conf ────────────────────────────────────────────────────────────
info "Writing Asterisk configuration..."
cat > "$AST_DIR/conf/sip.conf" <<EOF
[general]
allowguest=no
udpbindaddr=0.0.0.0:5060
tcpenable=no
externip=$PUBLIC_IP
localnet=0.0.0.0/0
canreinvite=no
nat=force_rport,comedia
registerattempts=0
registertimeout=20
qualify=yes
dtmfmode=rfc2833
disallow=all
allow=ulaw
allow=alaw
allow=g729

register => ${SIP_USER}:${SIP_PASS}@${SIP_HOST}/${SIP_USER}

#include sip_custom.conf
#include sip_agents.conf

[${SIP_USER}]
type=friend
host=${SIP_HOST}
username=${SIP_USER}
secret=${SIP_PASS}
fromdomain=${SIP_HOST}
insecure=port,invite
qualify=yes
EOF

# ── Write extensions_local.conf ───────────────────────────────────────────────
cat > "$AST_DIR/conf/extensions_local.conf" <<'EOF'
[autodialer]
; AutoDialer calls land here — variable AUTODIALER_PHONE_NUMBER is set by the dialer
exten => _X.,1,NoOp(AutoDialer call to ${AUTODIALER_PHONE_NUMBER})
 same => n,Set(CALLERID(num)=${AUTODIALER_PHONE_NUMBER})
 same => n,Dial(SIP/${AUTODIALER_PHONE_NUMBER}@TRUNK,${AUTODIALER_TIMEOUT},gM(autodialer))
 same => n,Hangup()

[autodialer-ivr-entry]
exten => _X.,1,Hangup()
EOF

# ── Write manager.conf (AMI) ─────────────────────────────────────────────────
cat > "$AST_DIR/conf/manager.conf" <<EOF
[general]
enabled=yes
port=5038
bindaddr=0.0.0.0

[autodialer_bot]
secret=${AMI_SECRET}
read=all
write=all
EOF

# ── Write modules.conf ────────────────────────────────────────────────────────
cat > "$AST_DIR/conf/modules.conf" <<'EOF'
[modules]
autoload=yes
EOF

# ── Start Asterisk container ──────────────────────────────────────────────────
info "Starting Asterisk container..."
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --net host \
  -v "$AST_DIR/conf:/etc/asterisk" \
  -v "$AST_DIR/sounds:/var/lib/asterisk/sounds" \
  "$ASTERISK_IMAGE"

sleep 5

# ── Reload dialplan ───────────────────────────────────────────────────────────
info "Reloading Asterisk dialplan..."
docker exec "$CONTAINER" asterisk -rx "module reload" 2>/dev/null || true
docker exec "$CONTAINER" asterisk -rx "dialplan reload" 2>/dev/null || true

# ── Replace TRUNK placeholder with actual SIP host ───────────────────────────
docker exec "$CONTAINER" sh -c \
  "sed -i 's/TRUNK/${SIP_HOST}/g' /etc/asterisk/extensions_local.conf" 2>/dev/null || \
  sed -i "s/TRUNK/${SIP_HOST}/g" "$AST_DIR/conf/extensions_local.conf"

docker exec "$CONTAINER" asterisk -rx "dialplan reload" 2>/dev/null || true

# ── Verify ───────────────────────────────────────────────────────────────────
info "Checking AMI port 5038..."
sleep 2
if nc -z localhost 5038 2>/dev/null; then
  info "AMI is accessible on port 5038."
else
  warn "AMI port 5038 not yet open — Asterisk may still be starting. Wait 10s and check: nc -z localhost 5038"
fi

echo ""
echo "============================================"
echo "  Asterisk setup complete!"
echo "============================================"
echo ""
echo "  Container:    $CONTAINER"
echo "  SIP Trunk:    $SIP_USER @ $SIP_HOST"
echo "  Public IP:    $PUBLIC_IP"
echo "  AMI port:     5038   (user: autodialer_bot)"
echo ""
echo "  Copy these into your backend .env:"
echo "  AMI_HOST=localhost"
echo "  AMI_PORT=5038"
echo "  AMI_USER=autodialer_bot"
echo "  AMI_SECRET=${AMI_SECRET}"
echo "  ASTERISK_CONTAINER=${CONTAINER}"
echo "  ASTERISK_CONTEXT=autodialer"
echo ""
echo "  Useful commands:"
echo "  docker logs -f $CONTAINER"
echo "  docker exec -it $CONTAINER asterisk -rvvv"
echo ""
