import {Component, OnInit, ViewChild} from "@angular/core";
import {FormBuilder, FormGroup, Validators} from "@angular/forms";
import {BehaviorSubject} from "rxjs";
import { ParameterLabelGroups } from "src/app/referential/services/model/model.enum";
import { PmfmStrategy } from "src/app/referential/services/model/pmfm-strategy.model";
import { PmfmFilter } from "src/app/referential/services/pmfm.service";
import { PmfmStrategiesTable } from "../../pmfm-strategies.table";


@Component({
  selector: 'app-pmfm-strategies-table-test',
  templateUrl: './pmfm-strategies.table.test.html'
})
export class PmfmStrategiesTableTestPage implements OnInit {

  enabled = true;

  @ViewChild('table1', { static: true }) table1: PmfmStrategiesTable;

  readonly pmfmFilters = {
    table1: <PmfmFilter>{
      levelLabels: ParameterLabelGroups.WEIGHT
    }
  };

  constructor() {}

  ngOnInit() {

    this.table1.value = [new PmfmStrategy(), new PmfmStrategy()]

  }

}

