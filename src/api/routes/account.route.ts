import express from "express";
import { getAccounts, createAccount, deleteAccount } from "../controllers/account.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/", authMiddleware,
  /*
    #swagger.path = '/account/'
    #swagger.tags = ['Account']
    #swagger.description = 'Get all accounts for the authenticated user'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  getAccounts
);

router.post("/", authMiddleware,
  /*
    #swagger.path = '/account/'
    #swagger.tags = ['Account']
    #swagger.description = 'Create a new account'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['body'] = {
      in: 'body',
      schema: {
        login: 'user@example.com',
        password: 'secret',
        name: 'My Account'
      }
    }
  */
  createAccount
);

router.delete("/:id", authMiddleware,
  /*
    #swagger.path = '/account/{id}'
    #swagger.tags = ['Account']
    #swagger.description = 'Delete an account by id'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  deleteAccount
);

export default router;
