import Location from "../../database/location.model";

export class LocationService {
    public static async GetAllCategories() {
    return await Location.findAll();
  }

  public static async GetLocationById(id: number) {
    return Location.findByPk(id);
  }

  public static async GetLocationByCianId(id: number) {
    return Location.findOne({
      where: { cianId: id }
    });
  }

  public static async GetLocationBySlug(slug: string) {
    return Location.findOne({
      where: { slug: slug }
    });
  }
}