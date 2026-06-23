import swaggerAutogen from "swagger-autogen";

const doc = {
  info: {
    title: "Cian Lead Generator API",
    description: "API для системы лидогенерации на основе Авито"
  },
  host: "localhost:3000",
  basePath: "/api",
  schemes: ["https"],
  securityDefinitions: {
    bearerAuth: {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      description: "JWT Bearer token"
    },
    adminKey: {
      type: "apiKey",
      name: "X-Admin-Key",
      in: "header",
      description: "Admin API key"
    }
  },
  security: [
    { "bearerAuth": [] }
  ]
};

const outputFile = "./swagger-output.json";
const routes = [
  "./routes/auth.route.ts",
  "./routes/category.route.ts",
  "./routes/account.route.ts",
  "./routes/dialog.route.ts",
  "./routes/filter.route.ts",
  "./routes/location.route.ts",
  "./routes/template.route.ts",
  "./routes/translate.route.ts",
  "./routes/upload.route.ts",
  "./routes/user.route.ts",
  "./routes/worker.route.ts"
];

swaggerAutogen({
  language: "ru-RU",
  autoQuery: false,
  autoBody: false,
  autoHeaders: false
})(outputFile, routes, doc);
