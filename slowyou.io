server {
    listen 80;
    listen [::]:80;
    server_name slowyou.io www.slowyou.io;

    root /var/www/html/slowyou.io;
    index index.html index.htm;

    access_log /var/log/nginx/slowyou.io.access.log;
    error_log /var/log/nginx/slowyou.io.error.log;

    # Main location serving static files
    location / {
        root /var/www/html/slowyou.io/public;
        try_files $uri $uri/ =404;
    }

    # API proxy to the Express backend
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
