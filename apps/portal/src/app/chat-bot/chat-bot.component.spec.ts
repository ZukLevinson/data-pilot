import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ChatBotComponent } from './chat-bot.component';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ChatService } from './chat.service';
import { of } from 'rxjs';
import { helloMessage } from '@org/portal/shared-ui';

describe('ChatBotComponent', () => {
  let component: ChatBotComponent;
  let fixture: ComponentFixture<ChatBotComponent>;
  let chatService: ChatService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatBotComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ChatService,
          useValue: {
            getConfig: () => of({ modelName: 'test-model', embeddingModel: 'test-embed' }),
            streamChat: async function* () { yield 'test chunk'; }
          }
        }
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatBotComponent);
    component = fixture.componentInstance;
    chatService = TestBed.inject(ChatService);
    fixture.detectChanges();
  });

  it('should create the chat bot component', () => {
    expect(component).toBeTruthy();
  });

  it('should display the initial bot message', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.answer-text')?.textContent).toContain(helloMessage);
  });

  it('should update inputText signal when typing', () => {
    component.inputText.set('test query');
    fixture.detectChanges();
    expect(component.inputText()).toBe('test query');
  });

  it('should render model badge when currentModel is set', () => {
    component.currentModel.set('qwen3-coder');
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.model-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('qwen3-coder');
  });
});
