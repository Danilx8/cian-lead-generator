import { Sequelize } from "sequelize";
import { ENV, logger } from "../config";

const sequelize = new Sequelize({
  dialect: ENV.DB_DIALECT,
  host: ENV.DB_HOST,
  port: Number(ENV.DB_PORT),
  database: ENV.DB_NAME,
  username: ENV.DB_USER,
  password: ENV.DB_PASSWORD,
  logging: false,
  pool: {
    max: 10, // default: 5
    acquire: 60000, // default: 30000
  }
});

export { sequelize };
