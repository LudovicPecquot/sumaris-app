import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Job } from '@app/social/job/job.model';
import { capitalizeFirstLetter, changeCaseToUnderscore, isNotNilOrBlank, LocalSettingsService, toBoolean } from '@sumaris-net/ngx-components';
import { TranslateService } from '@ngx-translate/core';

export interface JobReportModalOptions {
  title: string;
  job: Job;
}

@Component({
  selector: 'app-job-report-modal',
  templateUrl: './job.report.modal.html'
})
export class JobReportModal implements OnInit{

  @Input() title: string;
  @Input() job: Job;
  @Input() mobile: boolean;

  items: string[];
  message: string;
  showLog = false;

  constructor(
    protected translate: TranslateService,
    protected modalCtrl: ModalController,
    protected settings: LocalSettingsService
  ) {
  }

  ngOnInit() {
    this.mobile = toBoolean(this.mobile, this.settings.mobile);

    this.items = Object.entries(this.job?.report || {})
      .filter(([key, value]) => isNotNilOrBlank(value) && key !== 'message')
      .map(([key, value]) => {
        const i18nKey = 'SOCIAL.JOB.REPORT.STATS.' + changeCaseToUnderscore(key).toUpperCase();
        let message = this.translate.instant(i18nKey, this.job.report);
        // Missing i18n key
        if (message === i18nKey) {
          message = `${capitalizeFirstLetter(key)}: ${value}`;
        }
        return message;
      });
    this.message = this.job.report?.message;
  }

  close(event?: Event) {
    this.modalCtrl.dismiss();
  }
}
