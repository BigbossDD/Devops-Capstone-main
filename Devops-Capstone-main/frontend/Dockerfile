# Stage 1: build the React app
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time env vars so Vite bakes the correct API URLs into the bundle.
# In docker-compose these are overridden per environment.
ARG VITE_AUTH_URL=http://localhost:5001
ARG VITE_CATALOG_URL=http://localhost:5002
ARG VITE_ORDERS_URL=http://localhost:5003

ENV VITE_AUTH_URL=$VITE_AUTH_URL
ENV VITE_CATALOG_URL=$VITE_CATALOG_URL
ENV VITE_ORDERS_URL=$VITE_ORDERS_URL

RUN npm run build

# Stage 2: serve the built static files with nginx
FROM nginx:alpine

# Remove nginx default page
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config: serve index.html for any path (required for React Router)
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]