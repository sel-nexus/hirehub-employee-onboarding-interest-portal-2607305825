# Build the browser-only application, then serve it with SPA history fallback.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-bin-links --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
