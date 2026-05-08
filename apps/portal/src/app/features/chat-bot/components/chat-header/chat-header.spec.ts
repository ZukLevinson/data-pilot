import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatHeaderComponent } from './chat-header';
import { ChatService } from '../../../../core/services/chat.service';
import { signal } from '@angular/core';

describe('ChatHeaderComponent', () => {
  let component: ChatHeaderComponent;
  let fixture: ComponentFixture<ChatHeaderComponent>;
  let mockChatService: any;

  beforeEach(async () => {
    mockChatService = {
      messages: signal<ChatMessage[]>([]),
      currentSources: signal<EntitySearchResult[]>([]),
      currentQueryPlan: signal<QueryPlan | null>(null),
      currentModel: signal<string | null>(null),
      statusText: signal<string | null>(null),
      history: signal<SavedQuery[]>([]),
      isWaiting: signal<boolean>(false),
      showHistory: signal<boolean>(false),
      editingPlan: signal<QueryPlan | null>(null),
      healthStatus: signal<{
        database: 'online' | 'offline';
        llm: 'online' | 'offline';
      }>({
        database: 'online',
        llm: 'online',
      }),
    };

    await TestBed.configureTestingModule({
      imports: [ChatHeaderComponent],
      providers: [{ provide: ChatService, useValue: mockChatService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
