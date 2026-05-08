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
      showHistory: signal(false),
      currentModel: signal('test-model'),
      healthStatus: signal({ database: 'online', llm: 'online' })
    };

    await TestBed.configureTestingModule({
      imports: [ChatHeaderComponent],
      providers: [
        { provide: ChatService, useValue: mockChatService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
