import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "./database";

interface ICategoryAttributes {
  id: number;
  cianId: string;
  slug: string;
  name: string;
  parentId: string;
}

interface ICategoryCreationAttributes extends Optional<ICategoryAttributes, "id" | "parentId"> {
}

class Category extends Model<ICategoryAttributes, ICategoryCreationAttributes>
  implements ICategoryAttributes {
  declare id: number;
  declare cianId: string;
  declare slug: string;
  declare name: string;
  declare parentId: string;
}

Category.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    cianId: {
      type: DataTypes.INTEGER,
      unique: true,
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [0, 100]
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "categories",
        key: "cianId"
      }
    }
  }, {
    sequelize,
    tableName: "categories",
    timestamps: false
  }
);

export default Category;