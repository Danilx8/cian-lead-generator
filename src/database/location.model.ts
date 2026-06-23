import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "./database";

interface ILocationAttributes {
  id: number;
  cianId: string;
  slug: string;
  name: string;
}

interface ILocationCreationAttributes extends Optional<ILocationAttributes, "id"> {
}

class Location extends Model<ILocationAttributes, ILocationCreationAttributes>
  implements ILocationAttributes {
  declare id: number;
  declare cianId: string;
  declare name: string;
  declare slug: string;
}

Location.init({
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
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: "locations",
    timestamps: false
  });

export default Location;