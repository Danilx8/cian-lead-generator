import Account from "../../database/account.model";
import { Transaction } from "sequelize";
import { ApiError } from "../errors/api.error";

export class AccountService {
  public static async createAccount(
    login: string,
    password: string,
    userId: number,
    name?: string,
    proxyId?: number
  ): Promise<Account> {
    return await Account.create({ login, password, userId, name, proxyId });
  }

  public static async getAccount(id: number) {
    return await Account.findByPk(id);
  }

  public static async getAccountById(id: number) {
    return await Account.findByPk(id);
  }

  public static async getAllAccounts(userId: number): Promise<Account[]> {
    return await Account.findAll({ where: { userId } });
  }

  public static async peekAccount(userId: number, transaction?: Transaction): Promise<Account> {
    while (true) {
      const account = await Account.findOne({
        where: { userId },
        order: [["createdAt", "DESC"]],
        lock: transaction?.LOCK.UPDATE,
        skipLocked: true,
        transaction
      });

      if (!account) {
        throw new ApiError(417, "Couldn't find account");
      }

      if (account.login && account.password) {
        await account.destroy({ transaction });
        return account;
      }

      await account.destroy({ transaction });
    }
  }

  public static async deleteAccount(account: Account): Promise<void> {
    await account.destroy();
  }

  public static async restoreAccount(id: number): Promise<void> {
    await Account.restore({ where: { id } });
  }

  public static async deleteAccountById(id: number, userId: number): Promise<boolean> {
    const account = await Account.findOne({ where: { id, userId } });
    if (!account) return false;
    await account.destroy();
    return true;
  }
}
