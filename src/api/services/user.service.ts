import User, { UserStatus } from "../../database/user.model";
import { ApiError } from "../errors/api.error";
import Worker from "../../database/worker.model";
import AvatarService from "./avatar.service";

class UserService {
  static async createUser(
    email: string,
    passwordHash: string,
    username: string,
    status?: UserStatus
  ) {
    let avatarPath: string | undefined;
    try {
      avatarPath = await AvatarService.generateAndStore(username || email);
    } catch (_) {}
    return await User.create({
      email,
      passwordHash,
      username,
      avatarPath,
      ...(status ? { status } : {}),
    });
  }

  static async getUsersByStatus(status: UserStatus) {
    return User.findAll({ where: { status } });
  }

  static async setUserStatus(id: number, status: UserStatus) {
    return this.updateUser(id, { status } as Partial<User>);
  }

  static async getUserById(id: number) {
    return User.findOne({ where: { id } });
  }

  static async getUserByEmail(email: string) {
    return User.findOne({ where: { email } });
  }

  static async getUserIdByWorkerId(workerId: number): Promise<number | null> {
    return await Worker.findByPk(workerId).then(async (worker) => {
      if (worker) return worker.userId;
      return null;
    });
  }

  static async updateUser(id: number, updateData: Partial<User>) {
    const user = await this.getUserById(id);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    await user.update(updateData);
    return user;
  }

  static async getWorkers(userId: number) {
    return Worker.findAll({ where: { userId } });
  }

  static async getChunkSize(userId: number) {
    const user = await User.findByPk(userId);
    if (!user) return null;
    return user.itemsChunkSize;
  }

  static async getAllUsers() {
    return await User.findAll({});
  }
}

export default UserService;
