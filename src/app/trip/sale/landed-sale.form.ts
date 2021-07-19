import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, ViewChild} from '@angular/core';
import {Sale} from "../services/model/sale.model";
import {DateAdapter} from "@angular/material/core";
import {Moment} from "moment";
import {FormBuilder} from "@angular/forms";
import {LocalSettingsService}  from "@sumaris-net/ngx-components";
import {ProductsTable} from "../product/products.table";
import {MeasurementsForm} from "../measurement/measurements.form.component";
import {SaleValidatorService} from "../services/validator/sale.validator";
import {AppForm}  from "@sumaris-net/ngx-components";

@Component({
  selector: 'app-landed-sale-form',
  templateUrl: './landed-sale.form.html',
  styleUrls: ['./landed-sale.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandedSaleForm extends AppForm<Sale> implements OnInit {

  @Input() program: string;

  @Input() showError = false;

  @ViewChild('saleMeasurementsForm', {static: true}) saleMeasurementsForm: MeasurementsForm;
  @ViewChild('productsTable', {static: true}) productsTable: ProductsTable;

  totalPriceCalculated: number;

  get value(): any {
    const value = this.form.value;
    value.measurements = this.saleMeasurementsForm.value;
    value.products = this.productsTable.value; //.map(product => product.asObject());
    return value;
  }

  set value(data: any) {
    this.setValue(data);
  }

  constructor(
    protected landedSaleValidatorService: SaleValidatorService,
    protected dateAdapter: DateAdapter<Moment>,
    protected formBuilder: FormBuilder,
    protected settings: LocalSettingsService,
    protected cd: ChangeDetectorRef
  ) {
    super(dateAdapter, landedSaleValidatorService.getFormGroup(undefined, {required: false}), settings);

  }

  setValue(data: Sale, opts?: { emitEvent?: boolean; onlySelf?: boolean }) {
    super.setValue(data, opts);

    this.saleMeasurementsForm.value = data.measurements || [];

    // populate table
    this.productsTable.value = data.products;
  }


  ngOnInit() {
    super.ngOnInit();

  }

  enable(opts?: { onlySelf?: boolean; emitEvent?: boolean }): void {
    super.enable(opts);
    this.saleMeasurementsForm.enable(opts);
  }

  disable(opts?: { onlySelf?: boolean; emitEvent?: boolean }) {
    super.disable(opts);
    this.saleMeasurementsForm.disable(opts);
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }

}
