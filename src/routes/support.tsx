import { createFileRoute } from "@tanstack/react-router";
import LegalPage, { LEGAL, LegalSection } from "@/components/legal/LegalPage";

const TITLE = "Поддержка RuChat";
const DESCRIPTION = "Помощь по мессенджеру RuChat: ответы на вопросы и связь со службой поддержки.";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Support,
});

function Support() {
  return (
    <LegalPage title="Поддержка">
      <LegalSection title="Связаться с нами">
        <p>
          Если у вас возник вопрос или что-то работает не так, напишите нам на{" "}
          <a href={`mailto:${LEGAL.email}`} className="font-medium underline">{LEGAL.email}</a>. Мы отвечаем в течение
          1–2 рабочих дней. Укажите модель телефона и опишите, что произошло.
        </p>
      </LegalSection>

      <LegalSection title="Как зарегистрироваться?">
        <p>Откройте {LEGAL.app}, введите номер телефона, имя и придумайте пароль. После этого можно сразу писать и звонить.</p>
      </LegalSection>

      <LegalSection title="Как найти собеседника?">
        <p>
          Нажмите «+» на экране чатов и введите номер телефона человека или выберите его из контактов телефона. Собеседник
          тоже должен быть зарегистрирован в {LEGAL.app}.
        </p>
      </LegalSection>

      <LegalSection title="Не проходит звонок">
        <p>
          Проверьте, что приложению разрешён доступ к микрофону и камере: «Настройки» iPhone → {LEGAL.app}. Убедитесь,
          что у обоих собеседников стабильный интернет.
        </p>
      </LegalSection>

      <LegalSection title="Перенос на новый телефон">
        <p>
          Сообщения защищены сквозным шифрованием и хранятся только на ваших устройствах. Чтобы сохранить доступ к
          переписке, заранее включите «Резервную копию ключей» в настройках приложения, затем войдите с тем же номером на
          новом телефоне.
        </p>
      </LegalSection>

      <LegalSection title="Удаление аккаунта">
        <p>
          Напишите на <a href={`mailto:${LEGAL.email}`} className="font-medium underline">{LEGAL.email}</a> с номера,
          привязанного к аккаунту, и мы удалим ваши данные. Подробнее — в{" "}
          <a href="/privacy" className="font-medium underline">Политике конфиденциальности</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
