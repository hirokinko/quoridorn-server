import {StoreObj} from "../@types/store";
import {Resister} from "../server";
import {getData, setEvent} from "./common";
import Driver from "nekostore/lib/Driver";
import DocumentSnapshot from "nekostore/lib/DocumentSnapshot";
import {ApplicationError} from "../error/ApplicationError";
import {DeleteDataRequest} from "../@types/socket";
import {releaseTouchData} from "./release-touch-data";

// インタフェース
const eventName = "delete-data";
type RequestType = DeleteDataRequest;
type ResponseType = void;

/**
 * データ削除処理
 * @param driver
 * @param exclusionOwner
 * @param arg
 */
async function deleteData(driver: Driver, exclusionOwner: string, arg: RequestType): Promise<ResponseType> {
  // タッチ解除
  await releaseTouchData(driver, exclusionOwner, arg, true);

  // 直列の非同期で全部実行する
  await arg.idList
    .map((id: string) => () => singleDeleteData(
      driver,
      arg.collection,
      id
    ))
    .reduce((prev, curr) => prev.then(curr), Promise.resolve());
}

async function singleDeleteData(
  driver: Driver,
  collection: string,
  id: string
): Promise<void> {
  const msgArg = { collection, id };

  const docSnap: DocumentSnapshot<StoreObj<any>> | null = await getData(
    driver,
    collection,
    id
  );

  // Untouched check.
  if (!docSnap || !docSnap.exists()) throw new ApplicationError(`Untouched data.`, msgArg);

  // Already check.
  const data = docSnap.data;
  if (!data || !data.data) throw new ApplicationError(`Already deleted.`, msgArg);

  try {
    await docSnap.ref.delete();
  } catch (err) {
    throw new ApplicationError(`Failure delete doc.`, msgArg);
  }
}

const resist: Resister = (driver: Driver, socket: any): void => {
  setEvent<RequestType, ResponseType>(driver, socket, eventName, (driver: Driver, arg: RequestType) => deleteData(driver, socket.id, arg));
};
export default resist;
