import { Entity, EntityClass, isNotNil, ReferentialAsObjectOptions, ReferentialRef } from '@sumaris-net/ngx-components';
import { NOT_MINIFY_OPTIONS } from '@app/core/services/model/referential.utils';

@EntityClass({ typename: 'VesselOwnerVO' })
export class VesselOwner extends Entity<VesselOwner> {
  static ENTITY_NAME = 'VesselOwner';
  static fromObject: (source: any, opts?: any) => VesselOwner;

  lastName: string = null;
  firstName: string = null;
  program: ReferentialRef = null;

  constructor() {
    super(VesselOwner.TYPENAME);
  }

  fromObject(source: any) {
    super.fromObject(source);
    this.lastName = source.lastName;
    this.firstName = source.firstName;
    this.program = source.program && ReferentialRef.fromObject(source.program);
  }

  asObject(options?: ReferentialAsObjectOptions): any {
    const target: any = super.asObject(options);
    target.program =
      (this.program && this.program.asObject({ ...options, ...NOT_MINIFY_OPTIONS /*always keep for table*/ } as ReferentialAsObjectOptions)) ||
      undefined;
    if (options?.minify) {
      if (target.program) delete target.program.entityName;
    }
    return target;
  }

  equals(other: VesselOwner): boolean {
    return (
      (isNotNil(this.id) && super.equals(other)) ||
      // Compare functional properties
      (this.program && this.program.equals(other?.program) && this.lastName === other.lastName && this.firstName === other.firstName)
    );
  }
}
