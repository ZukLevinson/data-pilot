import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ChatBotComponent } from './chat-bot.component';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ChatService } from '../../core/services/chat.service';
import { of } from 'rxjs';
import { signal, WritableSignal } from '@angular/core';
import { Observable } from 'rxjs';
import { ChatMessage, EntitySearchResult, QueryPlan, SavedQuery, AppConfig } from '@org/models';

interface MockChatService {
  messages: WritableSignal<ChatMessage[]>;
  currentSources: WritableSignal<EntitySearchResult[]>;
  currentQueryPlan: WritableSignal<QueryPlan | null>;
  currentModel: WritableSignal<string | null>;
  statusText: WritableSignal<string | null>;
  history: WritableSignal<SavedQuery[]>;
  isWaiting: WritableSignal<boolean>;
  showHistory: WritableSignal<boolean>;
  editingPlan: WritableSignal<QueryPlan | null>;
  healthStatus: WritableSignal<{ database: 'online' | 'offline'; llm: 'online' | 'offline' }>;
  getConfig: () => Observable<AppConfig>;
  loadHistory: () => void;
  sendMessage: (t: string) => Promise<void>;
}

describe('ChatBotComponent', () => {
  let component: ChatBotComponent;
  let fixture: ComponentFixture<ChatBotComponent>;
  let mockChatService: MockChatService;

  beforeEach(async () => {
    mockChatService = {
      messages: signal([{ id: 0, sender: 'bot', text: 'שלום', timestamp: new Date() }]),
      currentSources: signal([]),
      currentQueryPlan: signal(null),
      currentModel: signal(null),
      statusText: signal(null),
      history: signal([]),
      isWaiting: signal(false),
      showHistory: signal(false),
      editingPlan: signal(null),
      healthStatus: signal({ database: 'online', llm: 'online' }),
      getConfig: () => of({ modelName: 'test-model', embeddingModel: 'test-embed' }),
      loadHistory: vi.fn(),
      sendMessage: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [ChatBotComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ChatService,
          useValue: mockChatService
        }
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatBotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the chat bot component', () => {
    expect(component).toBeTruthy();
  });

  it('should call loadHistory on init', () => {
    expect(mockChatService.loadHistory).toHaveBeenCalled();
  });
});
