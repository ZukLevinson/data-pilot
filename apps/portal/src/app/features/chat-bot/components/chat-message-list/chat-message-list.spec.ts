import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatMessageList } from './chat-message-list';

describe('ChatMessageList', () => {
  let component: ChatMessageList;
  let fixture: ComponentFixture<ChatMessageList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatMessageList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatMessageList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
