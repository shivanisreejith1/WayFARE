FROM node:20-alpine

WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend ./frontend
RUN cd frontend && npm run build

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy backend
COPY backend ./backend

WORKDIR /app/backend

EXPOSE 5000

CMD ["npm", "start"]