import { FilterOptions } from "../browsers/types";
import Filter from "../../../database/filter.model";
import LinkInterpreterService from "./linkInterpreter.service";
import { ApiError } from "../../errors/api.error";
import { QueryTypes, Transaction } from "sequelize";
import { WorkerState } from "../../../database/worker.model";
import { sequelize } from "../../../database/database";

export class FilterService {
  public static async getFilter(filterId: number) {
    return await Filter.findByPk(filterId);
  }

  public static async saveFilters(options: FilterOptions, userId: number, transaction?: Transaction): Promise<Filter> {
    const firstLink = options.parsingLink.split(",").map(s => s.trim()).filter(Boolean)[0];
    const urlFilters = await LinkInterpreterService.parseUrl(firstLink);

    let isActive = await this.getActiveFilter(userId) === null;

    return await Filter.create({
      name: options.name ?? "filter",
      isActive,
      searchLink: options.parsingLink,
      whiteList: options.whiteList,
      blackList: options.blackList,
      adsLimit: options.adsLimit,
      userId: userId,
      dealType: urlFilters.dealType,
      propertyType: urlFilters.propertyType,
      marketType: urlFilters.marketType,
      location: urlFilters.location,
      rooms: urlFilters.rooms,
      priceMin: urlFilters.priceMin,
      priceMax: urlFilters.priceMax,
      areaMin: urlFilters.areaMin,
      areaMax: urlFilters.areaMax,
      floorMin: urlFilters.floorMin,
      floorMax: urlFilters.floorMax,
      buildingType: urlFilters.buildingType,
      renovationType: urlFilters.renovationType,
      sellerType: urlFilters.sellerType,
      notFirstFloor: urlFilters.notFirstFloor,
      notLastFloor: urlFilters.notLastFloor,
      withPhotos: urlFilters.withPhotos,
      hasMortgage: urlFilters.hasMortgage,
      minDateRegistered: options.minDateRegistered?.toISOString(),
      maxDateRegistered: options.maxDateRegistered?.toISOString(),
    }, { transaction });
  }

  public static async getUsersFilters(userId: number): Promise<Filter[]> {
    return await Filter.findAll({ where: { userId } });
  }

  public static async getAllFilters(userId: number): Promise<Filter[]> {
    return await Filter.findAll({ where: { userId } });
  }

  public static async getActiveFilter(userId: number): Promise<Filter | null> {
    return await Filter.findOne({
      where: { userId, isActive: true }
    });
  }

  public static async getAllActiveFilters(): Promise<Filter[]> {
    return await sequelize.query(`
      WITH active_workers AS (
        SELECT DISTINCT w."filterId", w."userId"
        FROM workers w
        LEFT JOIN users u ON w."userId" = u.id
        WHERE w.status = 'ACTIVE'
        AND w."isActive" = true
        AND w."deletedAt" IS NULL
        AND (
          w."isBatchActive" = false
          OR w."batchStartTime" IS NULL
          OR (w."isBatchActive" = true
              AND (COALESCE(w."currentBatchSize", 0) <= u."itemsChunkSize")
              AND (EXTRACT(EPOCH FROM (NOW() - w."batchStartTime")) * 1000 < COALESCE(u."chunksInterval", 300000))
            )
        )
      )
      SELECT DISTINCT f.*
      FROM filters f
      WHERE f.id IN (SELECT "filterId" FROM active_workers WHERE "filterId" IS NOT NULL)
      OR (f."isActive" = true AND f."userId" IN (SELECT "userId" FROM active_workers))`,
      {
        replacements: { status: WorkerState.ACTIVE },
        type: QueryTypes.SELECT,
        model: Filter,
        mapToModel: true
      });
  }

  public static async updateFilter(id: number, updateData: Partial<Filter>, userId?: number): Promise<Filter> {
    const filter = await Filter.findByPk(id);
    if (!filter) throw new ApiError(400, "Filter not found");

    if (updateData.isActive) {
      await Filter.update(
        { isActive: false },
        { where: { userId, isActive: true } });
    }

    await filter.update(updateData);
    return filter;
  }

  public static async deleteFilter(id: number) {
    const filter = await Filter.findByPk(id);
    filter?.destroy();
  }
}
