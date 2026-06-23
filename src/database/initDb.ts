import { logger } from "../config";
import { sequelize } from "./database";
import Category from "./category.model";
import Dialog from "./dialog.model";
import Filter from "./filter.model";
import Item from "./item.model";
import Message from "./message.model";
import Proxy from "./proxy.model";
import User from "./user.model";
import Worker from "./worker.model";
import Account from "./account.model";
import Template from "./template.model";
import Merchant from "./merchant.model";
import Location from "./location.model";

export const initDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    logger.info("Database successfully synced!");
    logger.info(await Category.describe());
    logger.info(await Dialog.describe());
    logger.info(await Filter.describe());
    logger.info(await Item.describe());
    logger.info(await Message.describe());
    logger.info(await Proxy.describe());
    logger.info(await User.describe());
    logger.info(await Worker.describe());
    logger.info(await Account.describe());
    logger.info(await Merchant.describe());
    logger.info(await Template.describe());
    logger.info(await Location.describe());
  } catch (error) {
    logger.error("Database initialization error:", error);
    throw error;
  }
};

await initDatabase();
