#!/usr/bin/env python3
"""
Train a custom sentiment classifier on the Financial Phrasebank dataset for gold news analysis.
This script fine-tunes a Transformer model (e.g. FinBERT or BERT) using HuggingFace Transformers.
It assumes the dataset is stored in `public/data/financialphrasebank.csv` relative to the project root.

Usage:
    python train_sentiment_model.py --model_name ProsusAI/finbert --output_dir ./models/finbert-finetuned

The resulting model can be used in the Klever Orion pipeline to improve sentiment detection on news.
"""

import argparse
import pandas as pd
from sklearn.model_selection import train_test_split
from datasets import Dataset, ClassLabel
from transformers import AutoTokenizer, AutoModelForSequenceClassification, TrainingArguments, Trainer
import numpy as np
import evaluate

def load_data(csv_path: str) -> pd.DataFrame:
    """Load and normalise the financial phrase bank dataset.
    The function attempts to infer column names for the text and label fields and
    maps textual labels (positive/neutral/negative) to integer classes.
    """
    df = pd.read_csv(csv_path)
    # Determine text and label columns
    if 'sentence' in df.columns:
        text_col = 'sentence'
    else:
        text_col = df.columns[0]
    if 'label' in df.columns:
        label_col = 'label'
    elif 'sentiment' in df.columns:
        label_col = 'sentiment'
    else:
        label_col = df.columns[-1]

    # Map textual sentiments to numeric labels
    label_map = {'positive': 0, 'neutral': 1, 'negative': 2}
    if df[label_col].dtype == object:
        df[label_col] = df[label_col].str.lower().map(label_map)
    return df[[text_col, label_col]].rename(columns={text_col: 'text', label_col: 'label'})

def preprocess_function(examples, tokenizer):
    """Tokenize texts for the model with truncation and fixed max length."""
    return tokenizer(examples['text'], truncation=True, padding='max_length', max_length=128)

def main():
    parser = argparse.ArgumentParser(description="Fine-tune a transformer model on financial sentiment data")
    parser.add_argument('--csv_path', default='public/data/financialphrasebank.csv', help='Path to CSV dataset file')
    parser.add_argument('--model_name', default='ProsusAI/finbert', help='Pretrained model name (FinBERT, bert-base-uncased, etc.)')
    parser.add_argument('--output_dir', default='models/finbert-finetuned', help='Directory to save the fine-tuned model')
    parser.add_argument('--epochs', type=int, default=3, help='Number of training epochs')
    parser.add_argument('--batch_size', type=int, default=16, help='Batch size per device')
    args = parser.parse_args()

    # Load and split the dataset
    df = load_data(args.csv_path)
    train_df, test_df = train_test_split(df, test_size=0.2, random_state=42, stratify=df['label'])

    # Convert to HuggingFace Dataset format
    train_dataset = Dataset.from_pandas(train_df.reset_index(drop=True))
    test_dataset = Dataset.from_pandas(test_df.reset_index(drop=True))

    # Define class labels metadata
    class_labels = ClassLabel(num_classes=3, names=['positive', 'neutral', 'negative'])
    train_dataset = train_dataset.cast_column('label', class_labels)
    test_dataset = test_dataset.cast_column('label', class_labels)

    # Load model and tokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    model = AutoModelForSequenceClassification.from_pretrained(args.model_name, num_labels=3)

    # Tokenize datasets
    train_dataset = train_dataset.map(lambda x: preprocess_function(x, tokenizer), batched=True)
    test_dataset = test_dataset.map(lambda x: preprocess_function(x, tokenizer), batched=True)

    # Define evaluation metric
    metric = evaluate.load('accuracy')
    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        return metric.compute(predictions=preds, references=labels)

    # Training arguments
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        evaluation_strategy='epoch',
        save_strategy='epoch',
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        load_best_model_at_end=True,
        metric_for_best_model='accuracy',
    )

    # Create Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=test_dataset,
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
    )

    # Train and save model
    trainer.train()
    trainer.save_model(args.output_dir)


if __name__ == '__main__':
    main()
