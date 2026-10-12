import {PowerSyncDatabase} from '@powersync/react-native';
import * as Crypto from 'expo-crypto';
import {createDatabaseSchema} from './databaseSchema';
export const LOCAL_DB_FILENAME='lime-local.sqlite';
export const database=new PowerSyncDatabase({schema:createDatabaseSchema(),database:{dbFilename:LOCAL_DB_FILENAME}});
let initialization:Promise<void>|null=null;
export function initializeDatabase():Promise<void>{
 initialization??=(async()=>{await database.init();await database.writeTransaction(async tx=>{if(!await tx.getOptional("SELECT id FROM local_meta WHERE id='instance'"))await tx.execute('INSERT INTO local_meta(id,value) VALUES(?,?)',['instance',Crypto.randomUUID()]);});})().catch(error=>{initialization=null;throw error;});
 return initialization;
}
