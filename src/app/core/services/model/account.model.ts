import {UserSettings} from "./settings.model";
import {Person} from "./person.model";
import {EntityAsObjectOptions} from "./entity.model";
import {EntityClass} from "./entity.decorators";

/**
 * A user account
 */
@EntityClass({typename: 'AccountVO'})
export class Account extends Person<Account> {

  static fromObject: (source: any, opts?: any) => Account

  settings: UserSettings;

  constructor() {
    super(Account.TYPENAME);
    this.settings = new UserSettings();
  }

  clone(): Account {
    const target = new Account();
    target.fromObject(this);
    target.settings = this.settings && this.settings.clone() || undefined;
    return target;
  }

  asObject(options?: EntityAsObjectOptions): any {
    const target: any = super.asObject(options);
    target.settings = this.settings && this.settings.asObject(options) || undefined;
    return target;
  }

  fromObject(source: any) {
    super.fromObject(source);
    source.settings && this.settings.fromObject(source.settings);
  }

  /**
   * Convert into a Person. This will fill __typename with a right value, for data cache
   */
  asPerson(): Person {
    const person = Person.fromObject(this.asObject({
      keepTypename: true // This is need for the department object
    }));
    person.__typename = Person.TYPENAME; // Do not keep AccountVO as typename
    return person;
  }

  get displayName(): string {
    return accountToString(this);
  }

}


export function accountToString(data: Account): string {
  return data &&
    ((data.firstName && (data.firstName + " ") || "") +
      (data.lastName || "")) || "";
}
