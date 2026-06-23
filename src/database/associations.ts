import Dialog from "./dialog.model";
import User from "./user.model";
import Item from "./item.model";
import Worker from "./worker.model";
import Category from "./category.model";
import Merchant from "./merchant.model";
import Message from "./message.model";
import Filter from "./filter.model";
import Account from "./account.model";

User.hasMany(Dialog, { foreignKey: "userId", as: "dialogs" });
Dialog.belongsTo(User, { foreignKey: "userId", as: "user" });

Item.hasMany(Dialog, { foreignKey: "itemId", as: "dialogs" });
Dialog.belongsTo(Item, { foreignKey: "itemId", as: "item" });

Worker.hasMany(Dialog, { foreignKey: "workerId", as: "dialogs", onDelete: "SET NULL" });
Dialog.belongsTo(Worker, { foreignKey: "workerId", as: "worker" });

Category.hasMany(Item, { foreignKey: "categoryId", as: "items" });
Item.belongsTo(Category, { foreignKey: "categoryId", as: "category" });

Merchant.hasMany(Item, { foreignKey: "merchantId", as: "items" });
Item.belongsTo(Merchant, { foreignKey: "merchantId", as: "merchant" });

Dialog.hasMany(Message, { foreignKey: "dialogId", as: "messages" });
Message.belongsTo(Dialog, { foreignKey: "dialogId", as: "dialog" });

User.hasMany(Filter, { foreignKey: "userId", as: "filters" });
Filter.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(Account, { foreignKey: "userId", as: "accounts" });
Account.belongsTo(User, { foreignKey: "userId", as: "user" });
