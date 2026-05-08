import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QueryPlanViewerComponent } from './query-plan-viewer';
import { ChatService } from '../../../../core/services/chat.service';
import { DatePipe } from '@angular/common';
import { signal } from '@angular/core';

describe('QueryPlanViewerComponent', () => {
  let component: QueryPlanViewerComponent;
  let fixture: ComponentFixture<QueryPlanViewerComponent>;
  let mockChatService: any;

  beforeEach(async () => {
    mockChatService = {
      editingPlan: signal(null),
      runPlan: vi.fn(),
      currentQueryPlan: { set: vi.fn() }
    };

    await TestBed.configureTestingModule({
      imports: [QueryPlanViewerComponent],
      providers: [
        { provide: ChatService, useValue: mockChatService },
        DatePipe
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueryPlanViewerComponent);
    component = fixture.componentInstance;
    component.plan = {
      target: 'Mine',
      conditions: { AND: [] }
    } as any;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
