#!/usr/bin/env bash
# Run AFTER the apex A record updates on GoDaddy to point at 157.180.45.83.
#
# What it does on the server:
#   1. certbot issues a Let's Encrypt cert covering basestriker.xyz + www.
#   2. Rewrites /etc/nginx/sites-available/basestriker.xyz to add HTTPS
#      blocks for both the apex and www (with www → apex 301 redirect).
#   3. nginx reload + smoke-test.
#
# Re-running it is harmless — certbot --keep-until-expiring won't re-issue.

set -euo pipefail
SERVER="root@157.180.45.83"

ssh "$SERVER" '
set -e
echo "=== DNS sanity ===" && for h in basestriker.xyz www.basestriker.xyz; do
  ip=$(dig +short @8.8.8.8 "$h" | grep -E "^[0-9]" | head -1)
  echo "$h → $ip"
  if [ "$ip" != "157.180.45.83" ]; then
    echo "✖ $h is not pointing at us yet — wait for DNS propagation." >&2
    exit 2
  fi
done

echo "=== certbot ===" && certbot certonly --webroot -w /var/www/html --non-interactive --agree-tos \
  -m admin@soulview.org \
  -d basestriker.xyz -d www.basestriker.xyz \
  --keep-until-expiring 2>&1 | tail -5

cat > /etc/nginx/sites-available/basestriker.xyz <<NGINX
# ─── apex + www HTTP → HTTPS ────────────────────────────────────────
server {
    listen 80;
    server_name basestriker.xyz www.basestriker.xyz;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://basestriker.xyz\$request_uri; }
}

# ─── www → apex HTTPS canonicaliser ─────────────────────────────────
server {
    listen 443 ssl http2;
    server_name www.basestriker.xyz;
    ssl_certificate     /etc/letsencrypt/live/basestriker.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/basestriker.xyz/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    return 301 https://basestriker.xyz\$request_uri;
}

# ─── apex HTTPS — static frontend ──────────────────────────────────
server {
    listen 443 ssl http2;
    server_name basestriker.xyz;

    ssl_certificate     /etc/letsencrypt/live/basestriker.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/basestriker.xyz/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /.well-known/ {
        alias /var/www/basestriker/well-known/;
        default_type application/json;
        try_files \$uri =404;
    }

    root /var/www/basestriker/frontend/dist;
    index index.html;

    location ~* \.(?:js|css|png|svg|webp|woff2?|ttf|webmanifest)\$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }
    location = /sw.js { add_header Cache-Control "no-cache"; try_files \$uri =404; }
    location / { try_files \$uri \$uri/ /index.html; }

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
}

# ─── api.basestriker.xyz — HTTPS proxy to 127.0.0.1:8791 ───────────
server {
    listen 80;
    server_name api.basestriker.xyz;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name api.basestriker.xyz;

    ssl_certificate     /etc/letsencrypt/live/api.basestriker.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.basestriker.xyz/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:8791;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        client_max_body_size 2m;
    }

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
}
NGINX

nginx -t 2>&1 | tail -3 && systemctl reload nginx && echo "✓ nginx reloaded with full HTTPS"
'

echo "==> smoke"
for u in https://basestriker.xyz/ https://www.basestriker.xyz/ https://api.basestriker.xyz/api/health; do
  printf "  %-45s " "$u"
  curl -fsSI -o /dev/null -w "HTTP %{http_code}\n" "$u" 2>&1
done
