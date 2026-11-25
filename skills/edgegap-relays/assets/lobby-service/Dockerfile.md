# `assets/lobby-service/Dockerfile`

Template file. Write the content of the code block below, without the fences, to `Dockerfile`.

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.js"]
```
