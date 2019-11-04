import {StoreObj} from "../@types/store";
import {DeleteRoomRequest, RoomStore, UseStore} from "../@types/socket";
import {hashAlgorithm, Resister, SYSTEM_COLLECTION} from "../server";
import {verify} from "../password";
import {getRoomInfo, setEvent} from "./common";
import Driver from "nekostore/lib/Driver";
import DocumentSnapshot from "nekostore/lib/DocumentSnapshot";
import {ApplicationError} from "../error/ApplicationError";
import {SystemError} from "../error/SystemError";
import {releaseTouchRoom} from "./release-touch-room";

// インタフェース
const eventName = "delete-room";
type RequestType = DeleteRoomRequest;
type ResponseType = boolean;

/**
 * 部屋削除処理
 * @param driver
 * @param exclusionOwner
 * @param arg
 */
async function deleteRoom(driver: Driver, exclusionOwner: string, arg: RequestType): Promise<ResponseType> {
  // タッチ解除
  await releaseTouchRoom(driver, exclusionOwner, {
    roomNo: arg.roomNo
  }, true);

  // 部屋一覧の更新
  const docSnap: DocumentSnapshot<StoreObj<RoomStore>> = await getRoomInfo(
    driver,
    arg.roomNo,
    { id: arg.roomId }
  );

  if (!docSnap) throw new ApplicationError(`Untouched room error. room-no=${arg.roomNo}`);

  const data = docSnap.data;
  if (!data || !data.data) throw new ApplicationError(`Already deleted room error. room-no=${arg.roomNo}`);

  // 部屋パスワードチェック
  try {
    if (!await verify(docSnap.data.data.roomPassword, arg.roomPassword, hashAlgorithm)) {
      // パスワードチェックで引っかかった
      return false;
    }
  } catch (err) {
    throw new SystemError(`Login verify fatal error. room-no=${arg.roomNo}`);
  }

  const roomId = docSnap.ref.id;
  docSnap.ref.delete();

  // 部屋に紐づくユーザの削除
  const userCollection = driver.collection<StoreObj<UseStore>>(SYSTEM_COLLECTION.USER_LIST);
  const docs = (await userCollection.where("data.roomId", "==", roomId).get()).docs;
  docs.forEach(async doc => {
    if (!doc || !doc.exists()) return;
    await doc.ref.delete();
  });

  // TODO 各部屋情報コレクションの削除
  return true;
}

const resist: Resister = (driver: Driver, socket: any): void => {
  setEvent<RequestType, ResponseType>(driver, socket, eventName, (driver: Driver, arg: RequestType) => deleteRoom(driver, socket.id, arg));
};
export default resist;