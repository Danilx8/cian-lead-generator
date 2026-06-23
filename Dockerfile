# Этап 1: Сборка приложения
FROM node:20-slim AS builder

# Установка рабочей директории
WORKDIR /app

# Копирование package.json и package-lock.json из корня
COPY package.json package-lock.json* tsconfig.json ./

# Установка системных зависимостей для canvas и других библиотек
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Установка всех зависимостей (dependencies и devDependencies)
RUN npm install

# Копирование исходного кода (включая src)
COPY src ./src

# Сборка TypeScript в JavaScript
RUN npm run build

# Этап 2: Финальный образ для продакшена
FROM node:20-slim

# Установка рабочей директории
WORKDIR /app

# Установка только необходимых системных зависимостей для runtime
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    dnsutils \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Копирование package.json и package-lock.json
COPY package.json package-lock.json* ./

# Установка только продакшен-зависимостей
RUN npm install --production

# Копирование скомпилированного кода из этапа сборки
COPY --from=builder /app/dist ./dist

# Указание переменной окружения для Node.js
ENV NODE_ENV=production

# Открытие порта
EXPOSE 3050

# Команда для запуска приложения
CMD ["npm", "run", "start"]