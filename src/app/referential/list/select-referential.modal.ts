import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit} from "@angular/core";
import {ModalController} from "@ionic/angular";
import {changeCaseToUnderscore} from "@sumaris-net/ngx-components";
import {ReferentialFilter} from "../services/filter/referential.filter";
import {ReferentialRefService} from "../services/referential-ref.service";
import {ReferentialRef}  from "@sumaris-net/ngx-components";
import {BaseSelectEntityModal} from "./base-select-entity.modal";

@Component({
  selector: 'app-select-referential-modal',
  templateUrl: './select-referential.modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SelectReferentialModal extends BaseSelectEntityModal<ReferentialRef, ReferentialFilter> implements OnInit {

  @Input() entityName: string;

  constructor(
    protected viewCtrl: ModalController,
    protected dataService: ReferentialRefService,
    protected cd: ChangeDetectorRef
  ) {
    super(viewCtrl, ReferentialRef, dataService);
  }

  ngOnInit() {
    super.ngOnInit();

    // Copy the entityName to filter
    if (this.entityName) {
      this.filter.entityName = this.entityName;
    }
    if (!this.filter.entityName) {
      throw Error('Missing entityName');
    }
  }

  protected async computeTitle(): Promise<string> {
    return 'REFERENTIAL.ENTITY.' + changeCaseToUnderscore(this.filter.entityName).toUpperCase();
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
