import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueryPlanViewer } from './query-plan-viewer';

describe('QueryPlanViewer', () => {
  let component: QueryPlanViewer;
  let fixture: ComponentFixture<QueryPlanViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueryPlanViewer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueryPlanViewer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
